'use strict';
function operationError(code) {const error=new Error(code);error.code=code;return error;}
function isInterrupted(error) {return error?.name==='AbortError'||/CANCELLED|WORKSPACE_CHANGED|PLUGIN_UNLOADED|LOCAL_PROJECT_REQUIRED/.test(`${error?.code||''} ${error?.message||error||''}`);}
function notFound(error) {const code=String(error?.code??error?.errorCode??'');return /ENOENT|NOT_FOUND/i.test(code)||/ENOENT|NOT_FOUND|not found|does not exist|cannot list/i.test(String(error?.message||error));}
module.exports={operationError,isInterrupted,notFound};
