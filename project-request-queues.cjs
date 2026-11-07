'use strict';
const {RequestQueue,LatestSearches}=require('./request-queue.cjs');

// Keep search generation counters per project. Only idle entries may be evicted;
// active work and its FIFO queue always retain their owner until completion.
class ProjectRequestQueues {
 constructor(runSearch){this.runSearch=runSearch;this.projects=new Map();}
 get(workspacePath){
  let project=this.projects.get(workspacePath);
  if(!project){
   const queue=new RequestQueue(()=>this.trim());
   project={queue,latest:new LatestSearches(queue,(input,signal)=>this.runSearch(input,signal,workspacePath))};
  }
  this.projects.delete(workspacePath);this.projects.set(workspacePath,project);return project;
 }
 trim(){
  let idle=0;
  for(const project of this.projects.values())if(!project.queue.busy)idle++;
  for(const [path,project] of this.projects){
   if(idle<=32)break;
   if(project.queue.busy)continue;
   project.latest.close();project.queue.close();this.projects.delete(path);idle--;
  }
 }
 close(){for(const project of this.projects.values()){project.latest.close();project.queue.close();}this.projects.clear();}
}
module.exports={ProjectRequestQueues};
