import { main } from './main';
import { writeLog } from './utils/logger';

// 명령어 처리
const targetBlogId = process.argv.find((arg) => arg.startsWith('--blog='))?.split('=')[1];

if (process.argv.includes('--test')) {
    writeLog('테스트 모드로 실행됨');
    main().catch(error => {
        writeLog(`프로그램 실행 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    });
} else if (process.argv.includes('--crawl')) {
    main().catch(error => {
        writeLog(`프로그램 실행 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    });
} else {
    writeLog('명령어를 지정해주세요.');
    writeLog(`
사용 가능한 명령어:
--test   : 테스트 모드로 실행 (Firebase 저장 건너뜀)
--crawl  : 전체 블로그 크롤링
--blog=ID: 특정 블로그만 크롤링
    `);
    process.exit(1);
} 