import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const jobkoreaConfig: BlogConfig = {
    id: 'jobkorea',
    name: '잡코리아 X 알바몬',
    feedUrl: 'https://medium.com/feed/jobkorea-tech',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default jobkoreaConfig; 