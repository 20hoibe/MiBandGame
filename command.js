import { toArrayBuffer } from "./toArrayBuffer";

const VALUES = {
  OFF: 0x0,
  ON: 0x1
};

const MODI = {
  HEART_RATE: {
    CONTINUOUS: 0x1,
    MANUAL: 0x2
  }
};

export const COMMAND = {
  HEART_RATE: {
    DISABLE_MANUAL_MODE: toArrayBuffer([0x15, MODI.HEART_RATE.MANUAL, VALUES.OFF]),
    ENABLE_MANUAL_MODE: toArrayBuffer([0x15, MODI.HEART_RATE.MANUAL, VALUES.ON]),
    DISABLE_CONTINUOUS_MODE: toArrayBuffer([0x15, MODI.HEART_RATE.CONTINUOUS, VALUES.OFF]),
    ENABLE_CONTINUOUS_MODE: toArrayBuffer([0x15, MODI.HEART_RATE.CONTINUOUS, VALUES.ON]),
    PING: toArrayBuffer([0x16]),
  }
}
