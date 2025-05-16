import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const heydealerConfig: BlogConfig = {
    id: 'heydealer',
    name: '헤이딜러 테크블로그',
    feedUrl: 'https://medium.com/feed/prnd',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default heydealerConfig; 