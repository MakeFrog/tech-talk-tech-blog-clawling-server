import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const class101Config: BlogConfig = {
    id: 'class101',
    name: '클래스101',
    feedUrl: 'https://medium.com/feed/class101',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default class101Config; 