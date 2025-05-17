import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const idusConfig: BlogConfig = {
    id: 'idus',
    name: '아이디어스',
    feedUrl: 'https://medium.com/feed/idus-tech',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default idusConfig; 