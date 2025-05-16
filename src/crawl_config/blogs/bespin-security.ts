import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const bespinSecurityConfig: BlogConfig = {
    id: 'bespin-security',
    name: '베스핀글로벌 보안팀 테크블로그',
    feedUrl: 'https://medium.com/feed/opsnow-security',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default bespinSecurityConfig; 