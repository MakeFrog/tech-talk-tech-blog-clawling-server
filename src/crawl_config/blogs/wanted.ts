import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const wantedConfig: BlogConfig = {
    id: 'wanted',
    name: '원티드 테크블로그',
    feedUrl: 'https://medium.com/feed/wantedjobs',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default wantedConfig; 