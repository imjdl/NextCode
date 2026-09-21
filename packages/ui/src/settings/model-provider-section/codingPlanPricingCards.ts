// 死代码清理：原生购买组件 CodingPlanPricingCards 及其配套 resolver 已随
// CodingPlanPurchasePanel 一起下线，购买入口移除后不再有套餐商品源解析需求。
// 本文件仅保留仍被设置页登录流程使用的登录参数类型。
export type CodingPlanLoginOptions = {
  forceOAuth?: boolean;
};
