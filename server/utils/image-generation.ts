interface ImageRenderSettings {
  width: number;
  height: number;
  steps: number;
}

const vehiclePromptPattern =
  /\b(audi|bmw|mercedes|porsche|tesla|ferrari|lamborghini|toyota|honda|lexus|car|cars|vehicle|авто|автомоб|машин|ауді|бмв|мерседес|порше|тесла)\b/iu;

const landscapePromptPattern =
  /\b(outdoor|landscape|street|road|garage|driveway|parking|sunset|golden hour|wide shot|courtyard|yard|двор|пейзаж|вулиц|дорог|захід сонця|золотий час|wide|панорама)\b/iu;

export function resolveImageRenderSettings(params: {
  prompt: string;
  defaultWidth: number;
  defaultHeight: number;
  defaultSteps: number;
}): ImageRenderSettings {
  const normalizedPrompt = params.prompt.trim().toLowerCase();
  const settings: ImageRenderSettings = {
    width: params.defaultWidth,
    height: params.defaultHeight,
    steps: Math.max(params.defaultSteps, 4),
  };

  const looksWide =
    vehiclePromptPattern.test(normalizedPrompt) ||
    landscapePromptPattern.test(normalizedPrompt);

  if (looksWide) {
    settings.width = Math.max(settings.width, 1024);
    settings.height = Math.max(
      Math.min(settings.height, 640),
      576
    );
  } else {
    settings.width = Math.max(settings.width, 768);
    settings.height = Math.max(settings.height, 768);
  }

  return settings;
}
