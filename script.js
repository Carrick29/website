// 1. Firebase 配置
const firebaseConfig = {
    apiKey: "AIzaSyBQuGUV1A7esCJRkPhcAP6i2UStvdJw-Zg",
    authDomain: "pkpd-database.firebaseapp.com",
    databaseURL: "https://pkpd-database-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "pkpd-database",
    storageBucket: "pkpd-database.firebasestorage.app",
    messagingSenderId: "280364999020",
    appId: "1:280364999020:web:f565467add14c0c4851349",
    measurementId: "G-BDGVRP0DJM"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let currentDevice = null;
let currentDeviceName = "";
let scoreChart = null;
let scores = [];
let allChatLogs = []; // 用來暫存聊天記錄給報告使用

// --- 3.0 重點：聊天室功能 ---
function initChatSystem() {
    const chatBox = document.getElementById('chatHistory');
    const noteInput = document.getElementById('sysMsgInput');
    const sendBtn = document.getElementById('sendMsgBtn');
    const roleSelect = document.getElementById('noteRole');

    // 讀取留言列表 (使用 nursing_logs 作為新節點，避免與舊資料衝突)
    database.ref('nursing_logs').on('value', (snapshot) => {
        chatBox.innerHTML = ''; // 清空畫面
        allChatLogs = []; // 清空暫存
        
        const logs = snapshot.val();
        if (!logs) {
            chatBox.innerHTML = '<div class="chat-placeholder">暫無留言記錄，開始第一條備註吧...</div>';
            return;
        }

        // 遍歷所有留言 (Firebase 物件轉陣列)
        Object.values(logs).forEach(log => {
            allChatLogs.push(log); // 存入暫存供報告用
            
            // 建立卡片 DOM
            const msgDiv = document.createElement('div');
            msgDiv.className = `chat-message role-${getRoleClass(log.role)}`;
            
            msgDiv.innerHTML = `
                <div class="msg-header">
                    <span class="msg-role">${log.role || '未知'}</span>
                    <span class="msg-time">${log.time}</span>
                </div>
                <div class="msg-content">${escapeHtml(log.text)}</div>
            `;
            chatBox.appendChild(msgDiv);
        });

        // 自動捲動到底部
        chatBox.scrollTop = chatBox.scrollHeight;
    });

    // 發送留言
    sendBtn.onclick = () => {
        const text = noteInput.value.trim();
        const role = roleSelect.value;
        
        if (!text) return;

        sendBtn.textContent = "發送中...";
        sendBtn.disabled = true;

        // 使用 push() 來新增一條記錄，而不是 set() 覆蓋
        database.ref('nursing_logs').push({
            role: role,
            text: text,
            time: new Date().toLocaleString()
        }).then(() => {
            noteInput.value = ''; // 清空輸入框
            sendBtn.textContent = "發送";
            sendBtn.disabled = false;
        }).catch(e => {
            console.error(e);
            alert("發送失敗");
            sendBtn.textContent = "發送";
            sendBtn.disabled = false;
        });
    };
}

// 輔助：根據角色回傳 CSS class 對應顏色
function getRoleClass(role) {
    if (role === '護理師') return 'nurse';
    if (role === '主治醫師') return 'doctor';
    if (role === '復健師') return 'therapist';
    if (role === '家屬') return 'family';
    return 'default';
}

// 輔助：防止 HTML 注入
function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/&/g, "&amp;")
               .replace(/</g, "&lt;")
               .replace(/>/g, "&gt;")
               .replace(/"/g, "&quot;")
               .replace(/'/g, "&#039;");
}

// 遠程控制
function setDifficulty(level) {
    if (!currentDevice) return;
    const cmdStatus = document.getElementById('cmdStatus');
    cmdStatus.textContent = "發送中...";
    database.ref(`devices/${currentDevice}/control/difficulty`).set(level)
        .then(() => { cmdStatus.textContent = "✅ 已發送"; setTimeout(() => { cmdStatus.textContent = ""; }, 3000); })
        .catch((e) => { cmdStatus.textContent = "❌ 失敗"; console.error(e); });
}

function initChart() {
    const ctx = document.getElementById('scoreChart').getContext('2d');
    if(scoreChart) scoreChart.destroy();
    scoreChart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [{ label: '分數', data: [], borderColor: '#0277bd', backgroundColor: 'rgba(2,119,189,0.1)', borderWidth: 2, fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } }
    });
}

function loadDevices() {
    const deviceList = document.getElementById('deviceList');
    database.ref('devices').on('value', (snapshot) => {
        const data = snapshot.val();
        deviceList.innerHTML = ''; 
        if (!data) { deviceList.innerHTML = '<div class="loading">無數據</div>'; return; }

        Object.keys(data).forEach(mac => {
            const btn = document.createElement('div');
            btn.className = 'device-chip' + (currentDevice === mac ? ' active' : '');
            
            const name = data[mac].info?.name || mac;
            btn.innerHTML = `📡 ${name}`;
            
            btn.onclick = () => selectDevice(mac, name);
            deviceList.appendChild(btn);
        });
        if (!currentDevice && Object.keys(data).length > 0) {
            const firstKey = Object.keys(data)[0];
            selectDevice(firstKey, data[firstKey].info?.name || firstKey);
        }
    });
}

function selectDevice(deviceId, deviceName) {
    if (currentDevice) {
        database.ref(`devices/${currentDevice}/sessions`).off();
        database.ref(`statistics/${currentDevice}`).off();
        database.ref(`devices/${currentDevice}/status/difficulty`).off();
        database.ref(`devices/${currentDevice}/realtime/state`).off();
    }
    currentDevice = deviceId;
    currentDeviceName = deviceName; 
    
    document.getElementById('remoteControls').style.display = 'flex';
    document.getElementById('reportBtn').style.display = 'block';

    document.querySelectorAll('.device-chip').forEach(el => {
        el.classList.remove('active');
        if(el.innerText.includes(deviceId) || el.innerText.includes(deviceName)) el.classList.add('active');
    });

    database.ref(`devices/${deviceId}/status/difficulty`).on('value', (snapshot) => {
        const val = snapshot.val();
        const badge = document.getElementById('currentDiff');
        if (val === 0) badge.textContent = "Easy";
        else if (val === 1) badge.textContent = "Hard";
        else if (val === 2) badge.textContent = "Auto";
        else badge.textContent = "Unknown";
    });

    database.ref(`devices/${deviceId}/realtime/state`).on('value', (snapshot) => {
        const state = snapshot.val();
        if (state) {
            document.getElementById('connectionStatus').textContent = state;
            document.getElementById('connectionStatus').className = "status-online";
        }
    });

    database.ref(`statistics/${deviceId}`).on('value', (snapshot) => {
        const stats = snapshot.val() || {};
        document.getElementById('totalGames').textContent = stats.totalGames || 0;
        document.getElementById('highScore').textContent = stats.highScore || 0;
    });

    database.ref(`devices/${deviceId}/sessions`).orderByChild('timestamp').limitToLast(50).on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) { 
            document.getElementById('recordsBody').innerHTML = '<tr><td colspan="5" class="loading">無記錄</td></tr>'; 
            scores = [];
            return; 
        }
        scores = Object.values(data).sort((a, b) => b.timestamp - a.timestamp);
        updateDashboard();
    });
}

function updateDashboard() {
    const tbody = document.getElementById('recordsBody');
    tbody.innerHTML = '';
    
    if (scores.length > 0) {
        const latest = scores[0];
        document.getElementById('latestScore').textContent = latest.score;
        let modeStr = latest.mode === 'memory' ? '記憶模式' : '計數模式';
        document.getElementById('latestMode').textContent = modeStr;
        document.getElementById('latestTime').textContent = new Date(latest.timestamp * 1000).toLocaleTimeString();
    }

    scores.forEach(record => {
        const row = tbody.insertRow();
        const date = record.timestamp ? new Date(record.timestamp * 1000) : new Date();
        let modeLabel = record.mode === 'memory' ? '記憶' : '計數';
        row.innerHTML = `<td>${date.toLocaleString()}</td><td><span class="mode-badge">${modeLabel}</span></td><td><span class="score-badge">${record.score}</span></td><td>${record.duration}s</td><td style="font-family: monospace; font-size: 0.8em; color:#999;">${record.sessionID || '-'}</td>`;
    });

    if (scoreChart) {
        const chartData = scores.slice(0, 10).reverse(); 
        scoreChart.data.labels = chartData.map(d => new Date(d.timestamp*1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}));
        scoreChart.data.datasets[0].data = chartData.map(d => d.score);
        scoreChart.update();
    }
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
}

function openReportModal() {
    if (!currentDevice || scores.length === 0) {
        alert("請先選擇設備，且確保有遊玩記錄才能生成報告！");
        return;
    }
    analyzeAndGenerateReport();
    document.getElementById('reportModal').style.display = 'flex';
}

function closeReportModal() {
    document.getElementById('reportModal').style.display = 'none';
}

function analyzeAndGenerateReport() {
    document.getElementById('rpt-device-name').textContent = currentDeviceName || currentDevice;
    document.getElementById('rpt-date').textContent = new Date().toLocaleString();
    document.getElementById('rpt-sample-count').textContent = scores.length;
    
    // --- 報告新功能：顯示最近 3 條留言 ---
    const rptList = document.getElementById('rpt-note-list');
    rptList.innerHTML = '';
    
    if (allChatLogs.length > 0) {
        // 取最後 3 條
        const recentLogs = allChatLogs.slice(-3).reverse();
        recentLogs.forEach(log => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${log.role}</strong> (${log.time}): ${log.text}`;
            rptList.appendChild(li);
        });
    } else {
        rptList.innerHTML = '<li style="font-style:italic;">暫無留言記錄</li>';
    }

    const recentGames = scores.slice(0, 5);
    const avgRecent = recentGames.reduce((sum, s) => sum + parseInt(s.score), 0) / recentGames.length;
    
    let avgOld = 0;
    let hasHistory = false;
    if (scores.length > 10) {
        const oldGames = scores.slice(5, 10);
        avgOld = oldGames.reduce((sum, s) => sum + parseInt(s.score), 0) / oldGames.length;
        hasHistory = true;
    }

    let summaryText = `根據系統記錄，該使用者近期共進行了 ${scores.length} 次認知訓練。最近 5 局的平均得分為 ${avgRecent.toFixed(1)} 分。`;
    let suggestions = [];

    if (hasHistory) {
        if (avgRecent > avgOld * 1.1) {
            summaryText += ` 與前一階段相比，使用者的表現有明顯提升（增長約 ${((avgRecent - avgOld)/avgOld*100).toFixed(0)}%），顯示反應能力正在改善。`;
            suggestions.push("📈 訓練效果顯著：建議維持目前的訓練頻率，並可嘗試切換到 'Hard' 模式以提供適當的挑戰。");
        } else if (avgRecent < avgOld * 0.9) {
            summaryText += ` 近期表現略有波動，平均分數較前一階段下降。可能受精神狀態或疲勞影響。`;
            suggestions.push("😴 注意休息：數據顯示專注力可能下降，建議在訓練前確保使用者有充足的睡眠。");
        } else {
            summaryText += ` 整體表現保持穩定，這對於認知障礙的延緩是非常積極的信號。`;
            suggestions.push("✅ 持續監測：目前狀況穩定，建議繼續鼓勵使用者每日進行至少 10 分鐘的練習。");
        }
    } else {
        summaryText += " 由於歷史數據不足，暫無法分析長期趨勢。";
        suggestions.push("ℹ️ 建立基準：請繼續累積更多訓練數據以便系統建立更準確的個人化模型。");
    }

    const lastGame = scores[0];
    if (lastGame.score < 50) {
        suggestions.push("💪 鼓勵機制：最近一次分數較低，請家屬多給予口頭鼓勵，避免使用者產生挫折感。");
    }

    document.getElementById('rpt-summary-text').textContent = summaryText;
    
    const ul = document.getElementById('rpt-suggestions');
    ul.innerHTML = "";
    suggestions.forEach(s => {
        const li = document.createElement('li');
        li.textContent = s;
        ul.appendChild(li);
    });
}

function downloadPDF() {
    const element = document.getElementById('printableArea');
    const opt = {
        margin:       10,
        filename:     `MemoryBloom_Report_${new Date().toISOString().slice(0,10)}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    const btn = document.querySelector('.btn-download');
    const originalText = btn.textContent;
    btn.textContent = "⏳ 生成中...";
    
    html2pdf().set(opt).from(element).save().then(() => {
        btn.textContent = originalText;
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initChart();
    initChatSystem(); // 改名為 initChatSystem
    loadDevices();
});