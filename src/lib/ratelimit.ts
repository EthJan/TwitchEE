import { Ratelimit } from "@upstash/ratelimit";

import { redis } from "./redis";

export const ratelimit = new Ratelimit ({
 redis,
 // limit request in a specific time frame: 
 // 10 requests in 10 seconds will cause a time out
 limiter: Ratelimit.slidingWindow(10, "10s"),
});
