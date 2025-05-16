import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const enlightenConfig: BlogConfig = {
    id: 'enlighten',
    name: '엔라이튼 테크블로그',
    feedUrl: 'https://medium.com/feed/solarconnectdev',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default enlightenConfig; 