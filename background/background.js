const GOOGLE_SPEECH_URI = 'https://www.google.com/speech-api/v1/synthesize',

    DEFAULT_HISTORY_SETTING = {
        enabled: true
    };

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request);
    const { word, lang } = request;
    
    const url = new URL('https://www.google.com/search');
    url.searchParams.append('hl', lang);
    url.searchParams.append('q', `define ${word}`);
    url.searchParams.append('gl', 'US');
    
    // 创建一个隐藏的标签页来加载内容
    browser.tabs.create({
        url: url.toString(),
        active: false,  // 保持在后台
    }).then(tab => {
        // 等待页面加载完成
        browser.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === tab.id && info.status === 'complete') {
                // 移除监听器
                browser.tabs.onUpdated.removeListener(listener);
                
                // 执行内容脚本来提取内容
                browser.tabs.executeScript(tab.id, {
                    code: `
                        function extractContent() {
                            const hdwElement = document.querySelector("[data-dobid='hdw']");
                            if (!hdwElement) return null;
                            
                            const word = hdwElement.textContent;
                            let meaning = "";
                            
                            const definitionDiv = document.querySelector("div[data-dobid='dfn']");
                            if (definitionDiv) {
                                definitionDiv.querySelectorAll("span").forEach(function(span){
                                    if(!span.querySelector("sup"))
                                        meaning = meaning + span.textContent;
                                });
                            }
                            
                            meaning = meaning[0].toUpperCase() + meaning.substring(1);
                            
                            const audio = document.querySelector("audio[jsname='QInZvb']");
                            const source = document.querySelector("audio[jsname='QInZvb'] source");
                            let audioSrc = source && source.getAttribute('src');
                            
                            if (audioSrc) {
                                !audioSrc.includes("http") && (audioSrc = audioSrc.replace("//", "https://"));
                            }
                            
                            return { word, meaning, audioSrc };
                        }
                        extractContent();
                    `
                }).then(results => {
                    const content = results[0];
                    console.log('Extracted content:', content);
                    
                    // 关闭临时标签页
                    browser.tabs.remove(tab.id).then(() => {
                        if (!content) {
                            console.log('No content extracted');
                            sendResponse({ content: null });
                            return;
                        }
                        
                        sendResponse({ content });
                        
                        // 保存到历史记录
                        browser.storage.local.get().then((results) => {
                            let history = results.history || DEFAULT_HISTORY_SETTING;
                            history.enabled && saveWord(content);
                        });
                    });
                }).catch(error => {
                    console.error('Script execution error:', error);
                    browser.tabs.remove(tab.id);
                    sendResponse({ content: null });
                });
            }
        });
    }).catch(error => {
        console.error('Tab creation error:', error);
        sendResponse({ content: null });
    });

    return true;
});

function extractMeaning (document, context) {
    console.log('Extracting meaning for context:', context);
    
    console.log('Document title:', document.title);
    console.log('Meta tags:', Array.from(document.getElementsByTagName('meta')).map(meta => ({
        name: meta.getAttribute('name'),
        content: meta.getAttribute('content')
    })));
    
    const hdwElement = document.querySelector("[data-dobid='hdw']");
    console.log('HDW element found:', !!hdwElement);
    if (hdwElement) {
        console.log('HDW element content:', hdwElement.textContent);
        console.log('HDW element HTML:', hdwElement.outerHTML);
    }
    
    if (!hdwElement) { 
        console.log('No hdw element found, dumping relevant document section:');
        const mainContent = document.querySelector('main') || document.body;
        console.log('Main content first 500 chars:', mainContent.innerHTML.substring(0, 500));
        return null; 
    }
    
    var word = hdwElement.textContent,
        definitionDiv = document.querySelector("div[data-dobid='dfn']"),
        meaning = "";

    if (definitionDiv) {
        definitionDiv.querySelectorAll("span").forEach(function(span){
            if(!span.querySelector("sup"))
                 meaning = meaning + span.textContent;
        });
    }

    meaning = meaning[0].toUpperCase() + meaning.substring(1);

    var audio = document.querySelector("audio[jsname='QInZvb']"),
        source = document.querySelector("audio[jsname='QInZvb'] source"),
        audioSrc = source && source.getAttribute('src');

    if (audioSrc) {
        !audioSrc.includes("http") && (audioSrc = audioSrc.replace("//", "https://"));
    }
    else if (audio) {
        let exactWord = word.replace(/·/g, ''),
            
        queryString = new URLSearchParams({
            text: exactWord, 
            enc: 'mpeg', 
            lang: context.lang, 
            speed: '0.4', 
            client: 'lr-language-tts', 
            use_google_only_voices: 1
        }).toString();

        audioSrc = `${GOOGLE_SPEECH_URI}?${queryString}`;
    }

    return { word: word, meaning: meaning, audioSrc: audioSrc };
};

function saveWord (content) {
    let word = content.word,
        meaning = content.meaning,
      
        storageItem = browser.storage.local.get('definitions');

        storageItem.then((results) => {
            let definitions = results.definitions || {};

            definitions[word] = meaning;
            browser.storage.local.set({
                definitions
            });
        })
}