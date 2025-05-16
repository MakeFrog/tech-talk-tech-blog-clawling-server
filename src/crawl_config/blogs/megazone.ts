import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const megazoneConfig: BlogConfig = {
    id: 'megazone',
    name: '메가존클라우드 테크블로그',
    feedUrl: 'https://medium.com/feed/ctc-mzc',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default megazoneConfig; 