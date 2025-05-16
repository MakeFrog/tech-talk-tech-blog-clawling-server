import { GoogleGenerativeAI } from '@google/generative-ai';
import { sendSlackMessage } from '../webHook/slack';
import { writeLog } from './logger';

// Gemini API 타입 확장
declare module '@google/generative-ai' {
    interface SingleRequestOptions {
        generationConfig?: {
            responseMimeType?: string;
            responseSchema?: any;
        };
    }
}

// 환경 변수에서 API 키 가져오기
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set in environment variables');
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export interface ContentAnalysisResult {
    isValid: boolean;
    skillIds: string[];
    jobGroupIds: string[];
}

// Gemini API 에러 타입 정의
interface GeminiError {
    message: string;
    status?: string;
    details?: string;
}

// 에러 메시지 생성 함수
function formatErrorMessage(error: any, title: string): string {
    let errorMessage = `🚨 Gemini AI 분석 실패\n`;
    errorMessage += `📝 분석 대상: ${title}\n`;

    if (error instanceof Error) {
        errorMessage += `❌ 에러: ${error.message}\n`;
        if ('status' in error) {
            errorMessage += `📊 상태: ${(error as any).status}\n`;
        }
        if ('details' in error) {
            errorMessage += `📋 상세: ${(error as any).details}\n`;
        }
    } else {
        errorMessage += `❌ 에러: ${String(error)}\n`;
    }

    return errorMessage;
}

export async function analyzeContent(title: string, content: string): Promise<ContentAnalysisResult> {
    try {
        // JSON 스키마 정의
        const responseSchema = {
            type: "OBJECT",
            properties: {
                isValid: {
                    type: "BOOLEAN",
                    description: '기술 콘텐츠 여부를 나타내는 boolean 값'
                },
                skillIds: {
                    type: "ARRAY",
                    items: {
                        type: "STRING",
                        enum: [
                            'apollo', 'armeria', 'aspnet', 'awskinesis', 'awsses', 'awssns', 'awssqs', 'celery',
                            'codeigniter', 'django', 'dropwizard', 'echo', 'expressjs', 'falcon', 'fastapi', 'fastify',
                            'fiber', 'flask', 'gin', 'grpc', 'hibernate', 'koa', 'ktor', 'laravel', 'liquibase',
                            'mybatis', 'nestjs', 'netty', 'nodejs', 'phoenix', 'rabbitmq', 'rubyonrails', 'sanic',
                            'spring', 'springboot', 'swagger', 'thrift', 'webrtc', 'datastructure', 'database',
                            'operatingsystem', 'network', 'airflow', 'awsathena', 'awsredshift', 'clickhouse', 'druid',
                            'flink', 'fluentd', 'googlebigquery', 'googledatastudio', 'grafana', 'hadoop', 'hazelcast',
                            'hbase', 'hive', 'impala', 'kafka', 'keras', 'kibana', 'kubeflow', 'kudu', 'looker', 'luigi',
                            'metabase', 'mlflow', 'nifi', 'presto', 'prometheus', 'pytorch', 'ranger', 'ray', 'redash',
                            'snowflake', 'spark', 'superset', 'tableau', 'tensorflow', 'trino', 'zeppelin', 'zipkin',
                            'arangodb', 'arcus', 'awsauroradb', 'awsdocumentdb', 'awsdynamodb', 'awsmariadb', 'cassandradb',
                            'ceph', 'cockroachdb', 'couchbase', 'cubrid', 'elasticsearch', 'greenplum', 'h2', 'influxdb',
                            'memcached', 'mongodb', 'mssql', 'mysql', 'neo4j', 'oracledb', 'postgresql', 'redis', 'rocksdb',
                            'solr', 'angular', 'backbonejs', 'docusaurus', 'electron', 'emberjs', 'emotion', 'gatsby',
                            'graphql', 'hugo', 'immer', 'jotai', 'meteor', 'mobx', 'nextjs', 'nuxtjs', 'opengl', 'reactivex',
                            'react', 'reactquery', 'recoil', 'redux', 'relay', 'storybook', 'styledcomponents', 'svelte',
                            'tailwind', 'unity', 'vuejs', 'vuex', 'zustand', 'webfrontend', 'clojure', 'cplusplus', 'csharp',
                            'dart', 'elixir', 'go', 'groovy', 'java', 'javascript', 'kotlin', 'lua', 'objectivec', 'perl',
                            'php', 'python', 'r', 'rescript', 'ruby', 'rust', 'scala', 'swift', 'typescript', 'alamofire',
                            'bazel', 'bitrise', 'dagger', 'exoplayer', 'fastlane', 'flutter', 'glide', 'googlefirebase',
                            'googlefirestore', 'lottie', 'moya', 'reactnative', 'reactorkit', 'realm', 'retrofit', 'ribs',
                            'snapkit', 'tuist', 'android', 'ios', 'designpattern', 'appium', 'cucumber', 'cypress', 'enzyme',
                            'jasmine', 'jest', 'junit', 'karma', 'kotest', 'locust', 'mocha', 'mockito', 'ngrinder',
                            'playwright', 'puppeteer', 'restassured', 'selenium', 'sinon', 'sonarqube', 'testinglibrary'
                        ]
                    },
                    description: '글에서 직접적으로 사용되거나 깊이 있게 다루는 기술 ID 목록'
                },
                jobGroupIds: {
                    type: "ARRAY",
                    items: {
                        type: "STRING",
                        enum: [
                            'software-engineer', 'web-developer', 'server-developer', 'frontend-developer',
                            'java-developer', 'c-cplusplus-developer', 'python-developer', 'machine-learning-engineer',
                            'system-network-administrator', 'android-developer', 'data-engineer',
                            'devops-system-administrator', 'nodejs-developer', 'ios-developer', 'embedded-developer',
                            'technical-support', 'development-manager', 'data-scientist', 'qa-test-engineer',
                            'hardware-engineer', 'big-data-engineer', 'security-engineer', 'product-manager',
                            'cross-platform-app-developer', 'blockchain-platform-engineer', 'dba', 'dotnet-developer',
                            'php-developer', 'audio-video-engineer', 'web-publisher', 'erp-specialist',
                            'graphics-engineer', 'vr-engineer', 'bi-engineer', 'ruby-on-rails-developer'
                        ]
                    },
                    description: '글의 내용을 실제 구현하거나 활용하는 직군 ID 목록'
                }
            },
            required: ['isValid', 'skillIds', 'jobGroupIds']
        };

        const model = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash',
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 2048,
            }
        });

        const prompt = `주어진 기술 블로그 글을 분석하여 기술 콘텐츠 여부를 판단하고, 관련된 개발 스킬과 직군을 추출하세요.

### 분석 요구사항:

1. **기술 콘텐츠 여부 판단 (isValid)**
- true로 판단하는 경우:
  * 구체적인 기술 구현 방법이나 아키텍처를 설명하는 글
  * 특정 기술의 심도 있는 분석이나 비교 글
  * 개발 과정에서의 문제 해결 경험
  * 기술적 의사 결정 과정과 그 이유를 설명하는 글

- false로 판단하는 경우:
  * 회사 소식, 행사 후기, 채용 공고
  * 개발자 인터뷰, 브이로그, 팟캐스트
  * 제품/서비스 단순 소개나 홍보
  * 기술적 내용이 거의 없는 일반적인 글

2. **개발 스킬 추출 규칙 (매우 중요)**
- 엄격한 추출 기준:
  * 글에서 직접 구현하거나 사용한 기술만 선택
  * 단순 언급, 계획, 예정된 기술은 제외
  * 글의 핵심 주제와 직접적으로 관련된 기술만 포함
  * 부가적이거나 주변적인 기술은 제외
- 수량 제한:
  * 최소 1개 이상 (기술 콘텐츠인 경우)
  * 최대 5개까지만 선택 (가장 중요한 기술만)
- 우선순위:
  1. 글의 제목에 직접 언급된 핵심 기술
  2. 글에서 상세히 설명하거나 구현 과정을 다룬 기술
  3. 실제 사용 사례나 문제 해결에 활용된 기술
- isValid가 false인 경우 반드시 빈 배열 반환
- 반드시 아래 허용된 skillIds 목록에서만 선택

허용된 skillIds 목록:
${responseSchema.properties.skillIds.items.enum.join(', ')}

3. **개발 직군 추출 규칙 (매우 중요)**
- 엄격한 추출 기준:
  * 글의 내용을 실제 구현하거나 개발한 직군만 선택
  * 단순 독자나 관심 직군은 제외
  * 글의 기술 수준과 깊이에 맞는 직군만 선택
- 수량 제한:
  * 최소 1개 이상 (기술 콘텐츠인 경우)
  * 최대 5개까지만 선택 (가장 연관성 높은 직군만)
- 우선순위:
  1. 글의 핵심 기술을 주로 다루는 직군
  2. 구현이나 문제 해결 과정에 직접 참여하는 직군
  3. 해당 기술 스택을 주로 사용하는 직군
- isValid가 false인 경우 반드시 빈 배열 반환
- 반드시 아래 허용된 jobGroupIds 목록에서만 선택

허용된 jobGroupIds 목록:
${responseSchema.properties.jobGroupIds.items.enum.join(', ')}

---

### 입력 데이터:

- **제목**: ${title}
- **내용**: ${content}

### 응답 규칙:
1. isValid가 false인 경우, skillIds와 jobGroupIds는 반드시 빈 배열([])로 반환
2. 리스트에 없는 스킬이나 직군 ID는 절대 포함하지 않음
3. skillIds와 jobGroupIds는 각각 최소 1개, 최대 5개까지만 선택
4. 반드시 다음 JSON 형식으로 응답하세요:

{
    "isValid": boolean,
    "skillIds": string[],
    "jobGroupIds": string[] 
}

### 응답 검증:
- skillIds와 jobGroupIds 합쳐서 총 10개를 넘지 않아야 함
- 기술 콘텐츠(isValid: true)인 경우 각각 최소 1개 이상 필수
- 허용된 목록에 없는 ID 사용 불가`;

        const result = await model.generateContent([
            { text: prompt }
        ]);

        const response = result.response;
        const text = response.text();

        try {
            // JSON 응답에서 코드 블록 마커 제거
            const cleanedText = text.replace(/```json\n|\n```/g, '').trim();

            // JSON 파싱
            const parsedResult = JSON.parse(cleanedText);

            // 허용된 값만 필터링
            const allowedSkillIds = new Set(responseSchema.properties.skillIds.items.enum);
            const allowedJobGroupIds = new Set(responseSchema.properties.jobGroupIds.items.enum);

            // isValid가 false인 경우 빈 배열 반환 보장
            const isValid = parsedResult.isValid ?? false;
            const skillIds = (!isValid || !Array.isArray(parsedResult.skillIds))
                ? []
                : parsedResult.skillIds.filter((id: string) => allowedSkillIds.has(id));
            const jobGroupIds = (!isValid || !Array.isArray(parsedResult.jobGroupIds))
                ? []
                : parsedResult.jobGroupIds.filter((id: string) => allowedJobGroupIds.has(id));

            return {
                isValid,
                skillIds,
                jobGroupIds
            };
        } catch (error) {
            const errorMessage = formatErrorMessage(error, title);
            writeLog(`JSON 파싱 실패: ${errorMessage}`);
            await sendSlackMessage(errorMessage);

            return {
                isValid: false,
                skillIds: [],
                jobGroupIds: []
            };
        }
    } catch (error) {
        const errorMessage = formatErrorMessage(error, title);

        // 토큰 한도 초과 에러 체크
        if (error instanceof Error) {
            const errorStr = error.toString().toLowerCase();
            if (
                errorStr.includes('quota') ||
                errorStr.includes('rate limit') ||
                errorStr.includes('too many requests') ||
                errorStr.includes('token limit')
            ) {
                const quotaErrorMsg = `🚨 Gemini AI 토큰 한도 초과!\n${errorMessage}`;
                writeLog(quotaErrorMsg);
                await sendSlackMessage(quotaErrorMsg);
            } else {
                writeLog(`Gemini API 호출 실패: ${errorMessage}`);
                await sendSlackMessage(errorMessage);
            }
        } else {
            writeLog(`알 수 없는 에러 발생: ${errorMessage}`);
            await sendSlackMessage(errorMessage);
        }

        return {
            isValid: false,
            skillIds: [],
            jobGroupIds: []
        };
    }
}  