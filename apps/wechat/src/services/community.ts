// SPDX-License-Identifier: MPL-2.0
// Community v2 is NOT Sites v1 /v1/sync, nor PR-03 private journal sync.
// Production public moderation and image-upload endpoints do not yet exist.
import Taro from '@tarojs/taro'
import { CommunityRepository } from '../../../../packages/core/src/community'
import { authService } from './wechat-auth'
export const communityRepository=new CommunityRepository({
  identity:{verifiedUserId:()=>authService.verifiedIdentity()?.userId||null},
  storage:{
    read:key=>Taro.getStorageSync(key) as unknown,
    write:(key,value)=>{Taro.setStorageSync(key,value)}
  },
  newId:()=>Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,15),
  now:()=>new Date().toISOString()
  // Intentionally NO source/publisher: Sites v1 lacks approved author+review
  // attestation, and a community-specific moderation API is not deployed.
})
export const COMMUNITY_REVIEW_API_ENABLED=false
