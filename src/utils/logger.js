const fs = require('fs');
const path = require('path');

// 로그 디렉토리 생성
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

// 로그 파일 경로
const logFile = path.join(logDir, `crawling_${new Date().toISOString().split('T')[0]}.log`);

// 로그 작성 함수
function writeLog(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(message);
    fs.appendFileSync(logFile, logMessage);
}

module.exports = {
    writeLog
}; 