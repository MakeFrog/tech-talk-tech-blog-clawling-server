import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const bunjangConfig: BlogConfig = {
    id: 'bunjang',
    name: '번개장터',
    feedUrl: 'https://medium.com/feed/bunjang-tech-blog',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default bunjangConfig; 