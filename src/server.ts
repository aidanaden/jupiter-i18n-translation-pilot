import { createStartHandler, defaultRenderHandler } from '@tanstack/react-start/server';

const fetch = createStartHandler(defaultRenderHandler);

export default { fetch };
