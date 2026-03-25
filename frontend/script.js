// 后端代理地址
var BACKEND_URL = '/api/chat';
var MAX_RETRIES = 10;

// 系统提示词
var SYSTEM_PROMPT = '你就是林松焜本人，不是什么数字分身，不要说自己是AI或数字分身。\n\n' +
  '【关于我】\n' +
  '- 大三学生，学嵌入式的\n' +
  '- 最近在做：ROS小车、ROS无人机、学AI Agent开发\n' +
  '- 关注嵌入式和AI领域\n' +
  '- 玩游戏（王者、火影忍者、宝可梦）——只有熟人才聊这个\n\n' +
  '【联系方式（只有被问到才说）】\n' +
  '- GitHub: Lin117-shygo\n' +
  '- 微信: Linand117\n' +
  '- 邮箱: 1132536623@qq.com\n\n' +
  '【说话风格——非常重要】\n' +
  '1. 只回答当前问题，不要主动介绍自己、不要主动说联系方式、不要主动介绍项目细节\n' +
  '2. 回答要短，像微信聊天一样，一两句话就够了\n' +
  '3. 对方语气不好/开喷/阴阳怪气时，用玩笑话怼回去，比如"666这期神了"、"我去，不早说"、"嘎嘎得啦赛"、"好好好这样是吧"、"？"、"6"\n' +
  '4. 对方正常问问题时，简洁回答，可以说"需要了解更多可以再问我"\n' +
  '5. 技术问题用人话回答，我只是个小白，不装专家\n' +
  '6. 不知道的事情就说不知道，别编\n\n' +
  '【示例】\n' +
  '访客："你是菜比" → "666这期神了" 或 "好好好"\n' +
  '访客："你在干嘛" → "最近在整理作品，还在搞ros小车，想了解更多可以再问我"\n' +
  '访客："怎么联系你" → "微信Linand117，或者发邮箱1132536623@qq.com都行"';

// 对话历史
var chatHistory = [];

// 添加消息到界面
function addMsg(text, isUser, msgId) {
  var box = document.getElementById('chatMessages');
  var msgDiv = document.createElement('div');
  msgDiv.className = 'message ' + (isUser ? 'user-message' : 'bot-message');
  if (msgId) msgDiv.id = msgId;

  var contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.innerHTML = text.replace(/\n/g, '<br>');

  msgDiv.appendChild(contentDiv);
  box.appendChild(msgDiv);
  box.scrollTop = box.scrollHeight;
  return msgDiv;
}

// 更新消息内容
function updateMsg(msgId, text) {
  var msgDiv = document.getElementById(msgId);
  if (msgDiv) {
    var contentDiv = msgDiv.querySelector('.message-content');
    if (contentDiv) {
      contentDiv.innerHTML = text.replace(/\n/g, '<br>');
    }
  }
  var box = document.getElementById('chatMessages');
  box.scrollTop = box.scrollHeight;
}

// 调用后端 API（带重试，流式模式）
function callAPI(userMessage, retryCount, msgId) {
  retryCount = retryCount || 0;

  // 构建消息列表
  var messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  for (var i = 0; i < chatHistory.length; i++) {
    messages.push(chatHistory[i]);
  }
  messages.push({ role: 'user', content: userMessage });

  var controller = new AbortController();
  var timeoutId = setTimeout(function() {
    controller.abort();
  }, 60000);

  fetch(BACKEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages: messages,
      max_tokens: 500
    }),
    signal: controller.signal
  })
  .then(function(response) {
    clearTimeout(timeoutId);
    if (!response.ok) {
      return response.text().then(function(text) {
        console.log('API Error:', response.status, text);
        throw new Error('HTTP ' + response.status);
      });
    }
    return response.body;
  })
  .then(function(body) {
    var reader = body.getReader();
    var decoder = new TextDecoder();
    var fullContent = '';

    function read() {
      reader.read().then(function(result) {
        if (result.done) {
          if (fullContent) {
            chatHistory.push({ role: 'user', content: userMessage });
            chatHistory.push({ role: 'assistant', content: fullContent });
            if (chatHistory.length > 20) {
              chatHistory = chatHistory.slice(-20);
            }
          }
          setInputEnabled(true);
          return;
        }

        var chunk = decoder.decode(result.value, { stream: true });
        var lines = chunk.split('\n');

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (line.startsWith('data: ')) {
            var data = line.slice(6);
            if (data === '[DONE]') {
              continue;
            }
            try {
              var json = JSON.parse(data);
              var delta = json.choices && json.choices[0] && json.choices[0].delta;
              if (delta && delta.content) {
                fullContent += delta.content;
                updateMsg(msgId, fullContent);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }

        read();
      }).catch(function(err) {
        if (fullContent) {
          setInputEnabled(true);
        } else {
          handleError(userMessage, retryCount, msgId, '读取流失败');
        }
      });
    }

    read();
  })
  .catch(function(err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      handleError(userMessage, retryCount, msgId, '请求超时');
    } else {
      handleError(userMessage, retryCount, msgId, err.message || '网络错误');
    }
  });
}

// 错误处理与重试
function handleError(userMessage, retryCount, msgId, errorMsg) {
  if (retryCount < MAX_RETRIES) {
    var nextRetry = retryCount + 1;
    updateMsg(msgId, '思考中...');
    setTimeout(function() {
      callAPI(userMessage, nextRetry, msgId);
    }, 1000 * nextRetry);
  } else {
    updateMsg(msgId, '抱歉，我现在有点累了，请稍后再问我吧~');
    setInputEnabled(true);
  }
}

// 设置输入框状态
function setInputEnabled(enabled) {
  document.getElementById('chatInput').disabled = !enabled;
  document.getElementById('sendBtn').disabled = !enabled;
  document.getElementById('sendBtn').textContent = enabled ? '发送' : '...';
}

// 发送消息
function send() {
  var input = document.getElementById('chatInput');
  var text = input.value;
  if (!text || !text.trim()) return;

  text = text.trim();
  addMsg(text, true);
  input.value = '';

  setInputEnabled(false);

  var msgId = 'bot-msg-' + Date.now();
  addMsg('思考中...', false, msgId);

  callAPI(text, 0, msgId);
}

// 绑定事件
document.getElementById('sendBtn').onclick = send;

document.getElementById('chatInput').onkeypress = function(e) {
  if (e.key === 'Enter' || e.keyCode === 13) {
    send();
  }
};
