import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const yanoljaConfig: BlogConfig = {
    id: 'yanolja',
    name: '야놀자',
    feedUrl: 'https://medium.com/feed/yanolja',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default yanoljaConfig; 