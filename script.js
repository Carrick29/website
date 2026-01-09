// 1. Firebase 配置 (使用您的配置)
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

// 2. 初始化 Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// 全局變量
let currentDevice = null;
let scoreChart = null;
let scores = [];

// 3. 初始化圖表
function initChart() {
    const ctx = document.getElementById('scoreChart').getContext('2d');
    if (scoreChart) scoreChart.destroy();

    scoreChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '分數',
                data: [],
                borderColor: '#0277bd',
                backgroundColor: 'rgba(2, 119, 189, 0.1)',
                borderWidth: 2,
                tension: 0.3,
                fill: true,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#0277bd',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#f0f0f0' } },
                x: { grid: { display: false } }
            }
        }
    });
}

// 4. 加載設備列表
function loadDevices() {
    const deviceList = document.getElementById('deviceList');
    // 監聽 '/devices' 節點
    database.ref('devices').on('value', (snapshot) => {
        const data = snapshot.val();
        deviceList.innerHTML = ''; // 清空

        if (!data) {
            deviceList.innerHTML = '<div class="loading">數據庫中沒有找到設備數據</div>';
            return;
        }

        // 遍歷所有 MAC 地址 key
        Object.keys(data).forEach(mac => {
            const btn = document.createElement('div');
            btn.className = 'device-chip' + (currentDevice === mac ? ' active' : '');
            // 顯示 MAC 地址
            btn.innerHTML = `📡 ${mac}`;
            btn.onclick = () => selectDevice(mac);
            deviceList.appendChild(btn);
        });

        // 自動選擇第一個設備
        if (!currentDevice && Object.keys(data).length > 0) {
            selectDevice(Object.keys(data)[0]);
        }
    });
}

// 5. 選擇設備並監聽數據
function selectDevice(deviceId) {
    // 移除舊監聽
    if (currentDevice) {
        database.ref(`devices/${currentDevice}/sessions`).off();
        database.ref(`statistics/${currentDevice}`).off();
    }

    currentDevice = deviceId;
    
    // 更新按鈕樣式
    document.querySelectorAll('.device-chip').forEach(el => {
        el.classList.remove('active');
        if(el.innerText.includes(deviceId)) el.classList.add('active');
    });

    const statusEl = document.getElementById('connectionStatus');
    statusEl.textContent = '正在同步數據...';
    statusEl.className = 'status-online';

    // --- A. 監聽統計數據 (修正路徑: /statistics/{mac}) ---
    database.ref(`statistics/${deviceId}`).on('value', (snapshot) => {
        const stats = snapshot.val();
        if (stats) {
            document.getElementById('totalGames').textContent = stats.totalGames || 0;
            document.getElementById('highScore').textContent = stats.highScore || 0;
            document.getElementById('totalScore').textContent = stats.totalScore || 0;
        } else {
            // 如果沒有統計數據
            document.getElementById('totalGames').textContent = '-';
        }
    });

    // --- B. 監聽遊戲記錄 (修正路徑: /devices/{mac}/sessions) ---
    database.ref(`devices/${deviceId}/sessions`).orderByChild('timestamp').limitToLast(50).on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) {
                document.getElementById('recordsBody').innerHTML = '<tr><td colspan="5" class="loading">尚無遊戲記錄</td></tr>';
                return;
        }

        // 轉換並排序 (最新的在前面)
        scores = Object.values(data).sort((a, b) => b.timestamp - a.timestamp);
        updateDashboard();
        statusEl.textContent = '實時連線中';
    });
}

// 6. 更新界面
function updateDashboard() {
    const tbody = document.getElementById('recordsBody');
    tbody.innerHTML = '';

    // A. 更新表格
    scores.forEach(record => {
        const row = tbody.insertRow();
        // 處理時間戳 (ESP32傳的是秒，JS需要毫秒)
        const date = record.timestamp ? new Date(record.timestamp * 1000) : new Date();
        const dateStr = date.toLocaleString('zh-TW');
        
        // 判斷模式
        let modeLabel = record.mode === 'memory' ? '記憶 (Memory)' : (record.mode === 'counting' ? '計數 (Count)' : record.mode);
        
        // Session ID (顯示部分)
        let sid = record.sessionID || 'N/A';

        row.innerHTML = `
            <td>${dateStr}</td>
            <td><span class="mode-badge">${modeLabel}</span></td>
            <td><span class="score-badge">${record.score}</span></td>
            <td>${record.duration}s</td>
            <td style="font-family: monospace; font-size: 0.8em; color: #999;">${sid}</td>
        `;
    });

    // B. 更新最新數據卡片
    if (scores.length > 0) {
        const latest = scores[0];
        document.getElementById('latestScore').textContent = latest.score;
        document.getElementById('latestMode').textContent = latest.mode === 'memory' ? 'Memory' : 'Counting';
        document.getElementById('latestTime').textContent = new Date(latest.timestamp * 1000).toLocaleTimeString();
    }

    // C. 更新圖表 (取最近 10 筆)
    if (scoreChart) {
        const chartData = scores.slice(0, 10).reverse(); // 反轉，讓舊的在左邊
        scoreChart.data.labels = chartData.map(d => {
            const date = new Date(d.timestamp * 1000);
            return `${date.getHours()}:${date.getMinutes()}`;
        });
        scoreChart.data.datasets[0].data = chartData.map(d => d.score);
        scoreChart.update();
    }

    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
}

// 啟動
document.addEventListener('DOMContentLoaded', () => {
    initChart();
    loadDevices();
});
