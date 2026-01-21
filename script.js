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

    database.ref('nursing_logs').on('value', (snapshot) => {
        chatBox.innerHTML = ''; 
        allChatLogs = []; 
        
        const logs = snapshot.val();
        if (!logs) {
            chatBox.innerHTML = '<div class="chat-placeholder">暫無留言記錄...</div>';
            return;
        }

        Object.values(logs).forEach(log => {
            allChatLogs.push(log);
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
        chatBox.scrollTop = chatBox.scrollHeight;
    });

    sendBtn.onclick = () => {
        const text = noteInput.value.trim();
        const role = roleSelect.value;
        if (!text) return;

        sendBtn.textContent = "發送中...";
        sendBtn.disabled = true;

        database.ref('nursing_logs').push({
            role: role,
            text: text,
            time: new Date().toLocaleString()
        }).then(() => {
            noteInput.value = '';
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

function getRoleClass(role) {
    if (role === '護理師') return 'nurse';
    if (role === '主治醫師') return 'doctor';
    if (role === '復健師') return 'therapist';
    if (role === '家屬') return 'family';
    return 'default';
}

function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
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

// --- v3.1 核心修改：針對阿茲海默症的分析邏輯 ---
function analyzeAndGenerateReport() {
    // 1. 動態修改標題，使其更符合醫療情境
    document.querySelector('.report-title-section h2').textContent = "Memory Bloom 認知功能追蹤報告";
    document.querySelector('.report-title-section p').textContent = "Cognitive Function Monitoring Report";

    document.getElementById('rpt-device-name').textContent = currentDeviceName || currentDevice;
    document.getElementById('rpt-date').textContent = new Date().toLocaleString();
    document.getElementById('rpt-sample-count').textContent = scores.length;
    
    // 留言列表
    const rptList = document.getElementById('rpt-note-list');
    rptList.innerHTML = '';
    if (allChatLogs.length > 0) {
        const recentLogs = allChatLogs.slice(-3).reverse();
        recentLogs.forEach(log => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${log.role}</strong> (${log.time}): ${log.text}`;
            rptList.appendChild(li);
        });
    } else {
        rptList.innerHTML = '<li style="font-style:italic;">暫無留言記錄</li>';
    }

    // 計算平均數據
    const recentGames = scores.slice(0, 5);
    const avgRecent = recentGames.reduce((sum, s) => sum + parseInt(s.score), 0) / recentGames.length;
    
    let avgOld = 0;
    let hasHistory = false;
    if (scores.length > 10) {
        const oldGames = scores.slice(5, 10);
        avgOld = oldGames.reduce((sum, s) => sum + parseInt(s.score), 0) / oldGames.length;
        hasHistory = true;
    }

    // 2. 分析文案生成 (Alzheimer's Focused)
    let summaryText = `根據系統監測，長者在近期共進行了 ${scores.length} 次認知復健訓練。最近 5 次訓練的平均準確度評分為 ${avgRecent.toFixed(1)} 分。`;
    let suggestions = [];

    if (hasHistory) {
        if (avgRecent > avgOld * 1.1) {
            // 進步情境
            summaryText += ` 數據顯示長者的短期記憶與反應力有回升跡象（提升約 ${((avgRecent - avgOld)/avgOld*100).toFixed(0)}%）。這顯示目前的訓練強度適中，有助於活化腦部神經連結 (Neuroplasticity)。`;
            suggestions.push("🧠 認知強化：建議維持目前的互動頻率，適度給予讚美以增強長者的自信心。");
            suggestions.push("💪 難度調整：若長者表現輕鬆，可嘗試微調至 'Auto' 或 'Hard' 模式以提供適當的認知刺激。");
        } else if (avgRecent < avgOld * 0.9) {
            // 退步情境
            summaryText += ` 近期認知表現出現波動，準確率較前一階段下降。對於阿茲海默症患者，這可能與情緒焦慮、睡眠品質或生理不適有關。`;
            suggestions.push("❤️ 情緒安撫：請觀察長者是否有焦慮或「日落症候群 (Sundowning)」現象，訓練時請保持耐心，避免強迫。");
            suggestions.push("📅 生活規律：建議固定訓練時間，建立穩定的生活作息有助於穩定認知狀態。");
        } else {
            // 穩定情境 (對於失智症，這就是好事！)
            summaryText += ` 認知狀態保持穩定。對於神經退化性疾病而言，「不退步」即是相當正面的指標，顯示目前的照護與訓練策略有效。`;
            suggestions.push("✅ 持續復健：請繼續鼓勵長者每日進行少量多次的練習，保持大腦活躍度。");
            suggestions.push("🏠 環境支持：確保訓練環境安靜、光線充足，減少分心因素。");
        }
    } else {
        summaryText += " 系統正在建立個人的認知基準線 (Baseline)。持續的數據積累將有助於更精準地評估病情發展。";
        suggestions.push("ℹ️ 建立習慣：初期建議以「陪伴」為主，讓長者熟悉設備操作，減少對科技產品的排斥感。");
    }

    // 檢查單次低分 (可能是心情不好或太累)
    const lastGame = scores[0];
    if (lastGame.score < 2) { // 假設分數很低
        suggestions.push("⚠️ 狀態關注：最新一次訓練分數較低，請確認長者是否疲勞或身體不適。");
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
        filename:     `MemoryBloom_CareReport_${new Date().toISOString().slice(0,10)}.pdf`,
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
    initChatSystem();
    loadDevices();
});