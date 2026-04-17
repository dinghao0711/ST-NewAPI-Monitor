import { extension_settings } from '../../../extensions.js';
import { eventSource, event_types } from '../../../../script.js';

const extensionName = 'newapi-monitor';
let refreshIntervalId = null;

const defaultSettings = {
    url: '',
    key: '',
    interval: 60,
    enabled: false
};

function loadSettings() {
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = defaultSettings;
    }
}

function formatUrl(url) {
    if (!url) return '';
    let cleanUrl = url.trim().replace(/\/+$/, '');
    if (cleanUrl.endsWith('/v1')) {
        cleanUrl = cleanUrl.slice(0, -3);
    }
    return cleanUrl;
}

async function fetchQuota() {
    const settings = extension_settings[extensionName];
    if (!settings.enabled || !settings.url || !settings.key) {
        $('#newapi-quota-display').hide();
        return;
    }

    const baseUrl = formatUrl(settings.url);
    const quotaDisplay = $('#newapi-quota-display');
    
    quotaDisplay.show().addClass('quota-refreshing');

    try {
        const subRes = await fetch(`${baseUrl}/v1/dashboard/billing/subscription`, {
            headers: { 'Authorization': `Bearer ${settings.key}` }
        });
        
        const startDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const endDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const usageRes = await fetch(`${baseUrl}/v1/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`, {
            headers: { 'Authorization': `Bearer ${settings.key}` }
        });

        if (subRes.ok && usageRes.ok) {
            const subData = await subRes.json();
            const usageData = await usageRes.json();

            const total = subData.hard_limit_usd || 0;
            const used = (usageData.total_usage || 0) / 100;
            const remaining = Math.max(0, total - used).toFixed(3);

            quotaDisplay.html(`💰 额度: $${remaining}`);
            quotaDisplay.attr('title', `总额: $${total.toFixed(2)} | 已用: $${used.toFixed(2)}`);
        } else {
            quotaDisplay.html(`⚠️ 额度: 获取失败`);
        }
    } catch (error) {
        console.error('NewAPI Monitor Error:', error);
        quotaDisplay.html(`⚠️ 额度: 网络错误`);
    } finally {
        quotaDisplay.removeClass('quota-refreshing');
    }
}

function setupTimer() {
    if (refreshIntervalId) clearInterval(refreshIntervalId);
    const settings = extension_settings[extensionName];
    if (settings.enabled && settings.interval >= 10) {
        refreshIntervalId = setInterval(fetchQuota, settings.interval * 1000);
    }
}

function saveSettings() {
    const settings = extension_settings[extensionName];
    settings.url = $('#newapi_url').val();
    settings.key = $('#newapi_key').val();
    settings.interval = parseInt($('#newapi_refresh_interval').val()) || 60;
    settings.enabled = $('#newapi_enable').is(':checked');
    
    setupTimer();
    fetchQuota();
}

jQuery(async () => {
    loadSettings();

    $('#top-bar').append('<div id="newapi-quota-display" title="点击手动刷新"></div>');
    
    const settingsHtml = await $.get(`extensions/${extensionName}/settings.html`);
    $('#extensions_settings').append(settingsHtml);

    const settings = extension_settings[extensionName];
    $('#newapi_url').val(settings.url);
    $('#newapi_key').val(settings.key);
    $('#newapi_refresh_interval').val(settings.interval);
    $('#newapi_enable').prop('checked', settings.enabled);

    $('#newapi_save_btn').on('click', saveSettings);
    $('#newapi-quota-display').on('click', fetchQuota);

    eventSource.on(event_types.MESSAGE_RECEIVED, () => {
        if (extension_settings[extensionName].enabled) {
            setTimeout(fetchQuota, 2000); 
        }
    });

    setupTimer();
    fetchQuota();
});