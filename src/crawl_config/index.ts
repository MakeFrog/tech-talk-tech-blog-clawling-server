import { BlogConfig } from '../types';
import jobkoreaConfig from './blogs/jobkorea';
import twentyNineCmConfig from './blogs/29cm';
import ssgConfig from './blogs/ssg';
import watchaConfig from './blogs/watcha';
import naverPlaceConfig from './blogs/naver-place';
import daangnConfig from './blogs/daangn';
import pinkfongConfig from './blogs/pinkfong';
import coupang from './blogs/coupang';
import naverD2 from './blogs/naver_d2';
import woowahan from './blogs/woowahan';
import line from './blogs/line';
import tvingConfig from './blogs/tving';
import class101Config from './blogs/class101';
import chunmyungConfig from './blogs/chunmyung';
import zigbangConfig from './blogs/zigbang';
import wantedConfig from './blogs/wanted';
import elecleConfig from './blogs/elecle';
import enlightenConfig from './blogs/enlighten';
import lemonbaseConfig from './blogs/lemonbase';
import bespinSecurityConfig from './blogs/bespin-security';
import bunjangConfig from './blogs/bunjang';
import megazoneConfig from './blogs/megazone';
import yanoljaConfig from './blogs/yanolja';
import myrealtripConfig from './blogs/myrealtrip';
import musinsaConfig from './blogs/musinsa';
import idusConfig from './blogs/idus';
import soomgoConfig from './blogs/soomgo';
import sixshopConfig from './blogs/sixshop';
import styleshareConfig from './blogs/styleshare';
import spoonConfig from './blogs/spoon';
import mildangConfig from './blogs/mildang';
import heydealerConfig from './blogs/heydealer';

export const blogConfigs: { [key: string]: BlogConfig } = {
    [jobkoreaConfig.id]: jobkoreaConfig,
    [twentyNineCmConfig.id]: twentyNineCmConfig,
    [ssgConfig.id]: ssgConfig,
    [watchaConfig.id]: watchaConfig,
    [naverPlaceConfig.id]: naverPlaceConfig,
    [daangnConfig.id]: daangnConfig,
    [pinkfongConfig.id]: pinkfongConfig,
    [coupang.id]: coupang,
    [naverD2.id]: naverD2,
    [woowahan.id]: woowahan,
    [line.id]: line,
    [tvingConfig.id]: tvingConfig,
    [class101Config.id]: class101Config,
    [chunmyungConfig.id]: chunmyungConfig,
    [zigbangConfig.id]: zigbangConfig,
    [wantedConfig.id]: wantedConfig,
    [elecleConfig.id]: elecleConfig,
    [enlightenConfig.id]: enlightenConfig,
    [lemonbaseConfig.id]: lemonbaseConfig,
    [bespinSecurityConfig.id]: bespinSecurityConfig,
    [bunjangConfig.id]: bunjangConfig,
    [megazoneConfig.id]: megazoneConfig,
    [yanoljaConfig.id]: yanoljaConfig,
    [myrealtripConfig.id]: myrealtripConfig,
    [musinsaConfig.id]: musinsaConfig,
    [idusConfig.id]: idusConfig,
    [soomgoConfig.id]: soomgoConfig,
    [sixshopConfig.id]: sixshopConfig,
    [styleshareConfig.id]: styleshareConfig,
    [spoonConfig.id]: spoonConfig,
    [mildangConfig.id]: mildangConfig,
    [heydealerConfig.id]: heydealerConfig
};

export const getBlogConfig = (blogId: string): BlogConfig | undefined => {
    return blogConfigs[blogId];
}; 