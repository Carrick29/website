// Firebase 配置
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

// 初始化 Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// 選取 HTML 元素
const statusDiv = document.getElementById('status');
const sendBtn = document.getElementById('sendBtn');

// 監聽按鈕點擊
sendBtn.addEventListener('click', () => {
    const newData = {
        message: "來自網頁的測試資料",
        timestamp: new Date().toLocaleString()
    };

    // 寫入 Firebase Realtime Database
    database.ref('messages').push(newData)
        .then(() => {
            statusDiv.innerText = "資料傳送成功！";
            statusDiv.style.color = "green";
        })
        .catch((error) => {
            statusDiv.innerText = "失敗：" + error.message;
            statusDiv.style.color = "red";
        });
});
