import { listKnowledgeFiles } from '../utils/knowledge-files';

export default defineEventHandler(async () => {
  return {
    files: await listKnowledgeFiles(),
  };
});
