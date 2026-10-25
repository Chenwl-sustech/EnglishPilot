import { redisAddress } from '../dist/redis.js';
const required=['DEEPSEEK_API_KEY','BACKEND_ACCESS_TOKEN','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN'];
const missing=required.filter(k=>!process.env[k]);
let valid=missing.length===0;
if(valid){try{redisAddress(process.env);if(process.env.BACKEND_ACCESS_TOKEN.length<32||/\s/.test(process.env.BACKEND_ACCESS_TOKEN)||/\s/.test(process.env.DEEPSEEK_API_KEY))valid=false;}catch{valid=false;}}
console.log(JSON.stringify({valid,missing,privateValuesPrinted:false}));
if(!valid)process.exitCode=1;
