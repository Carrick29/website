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
let scoreChart = null;
let scores = [];

// 初始化圖表
function initChart() {
    const ctx = document.getElementById('scoreChart').getContext('2d');
    scoreChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '分數',
                data: [],
                borderColor: '#0277bd',
                backgroundColor: 'rgba(2, 119, 189, 0.1)',
                fill: true,
                tension: 0.3
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// 監聽公告
function initAnnouncement() {
    const msgDisplay = document.getElementById('currentMsg');
    const msgInput = document.getElementById('sysMsgInput');
    const sendBtn = document.getElementById('sendMsgBtn');

    database.ref('system_announcement').on('value', (snapshot) => {
        msgDisplay.textContent = snapshot.val() || "暫無公告";
    });

    sendBtn.onclick = () => {
        const text = msgInput.value;
        if(text) {
            database.ref('system_announcement').set(text);
            msgInput.value = '';
        }
    };
}

// 加載設備
function loadDevices() {
    database.ref('devices').on('value', (snapshot) => {
        const data = snapshot.val();
        const list = document.getElementById('deviceList');
        list.innerHTML = '';
        if (!data) return;

        Object.keys(data).forEach(mac => {
            const btn = document.createElement('div');
            btn.className = 'device-chip' + (currentDevice === mac ? ' active' : '');
            btn.textContent = `📡 ${mac}`;
            btn.onclick = () => selectDevice(mac);
            list.appendChild(btn);
        });
        if (!currentDevice) selectDevice(Object.keys(data)[0]);
    });
}

function selectDevice(deviceId) {
    if (currentDevice) {
        database.ref(`devices/${currentDevice}/sessions`).off();
        database.ref(`statistics/${currentDevice}`).off();
    }
    currentDevice = deviceId;
    
    // 更新 UI 狀態
    document.querySelectorAll('.device-chip').forEach(el => {
        el.classList.toggle('active', el.textContent.includes(deviceId));
    });

    // 監聽數據
    database.ref(`statistics/${deviceId}`).on('value', (snapshot) => {
        const stats = snapshot.val() || {};
        document.getElementById('totalGames').textContent = stats.totalGames || 0;
        document.getElementById('highScore').textContent = stats.highScore || 0;
    });

    database.ref(`devices/${deviceId}/sessions`).limitToLast(50).on('value', (snapshot) => {
        const data = snapshot.val();
        scores = data ? Object.values(data).sort((a,b) => b.timestamp - a.timestamp) : [];
        updateUI();
    });
}

function updateUI() {
    const tbody = document.getElementById('recordsBody');
    tbody.innerHTML = '';
    
    if (scores.length > 0) {
        const latest = scores[0];
        document.getElementById('latestScore').textContent = latest.score;
        document.getElementById('latestMode').textContent = latest.mode;
        document.getElementById('latestTime').textContent = new Date(latest.timestamp*1000).toLocaleTimeString();
        
        // 更新表格
        scores.forEach(s => {
            const row = tbody.insertRow();
            row.innerHTML = `<td>${new Date(s.timestamp*1000).toLocaleString()}</td>
                             <td>${s.mode}</td><td>${s.score}</td>
                             <td>${s.duration}</td><td>${s.sessionID || 'N/A'}</td>`;
        });

        // 更新圖表
        const chartData = scores.slice(0, 10).reverse();
        scoreChart.data.labels = chartData.map(d => new Date(d.timestamp*1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}));
        scoreChart.data.datasets[0].data = chartData.map(d => d.score);
        scoreChart.update();
    }
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
}

document.addEventListener('DOMContentLoaded', () => {
    initChart();
    initAnnouncement();
    loadDevices();
});
