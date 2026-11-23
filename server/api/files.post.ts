import { saveKnowledgeFiles } from '../utils/knowledge-files';

export default defineEventHandler(async (event) => {
  const parts = await readMultipartFormData(event);

  if (!parts?.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Select at least one file to upload.',
    });
  }

  const result = await saveKnowledgeFiles(parts);

  if (!result.files.length) {
    const detail = result.skipped[0]?.reason || 'No supported file content was found.';

    throw createError({
      statusCode: 400,
      statusMessage: detail,
    });
  }

  return result;
});
