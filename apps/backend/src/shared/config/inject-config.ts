import { Inject } from '@nestjs/common';
import { CONFIG } from './config.module';

export const InjectConfig = () => Inject(CONFIG);