// Runs once in the parent Jest process; workers inherit the variable. Date logic resolves
// "tomorrow" etc. in device local time, so tests pin a zone with DST and a non-zero offset
// (setting process.env.TZ inside a test file does not reach Node's Date in Jest's sandbox).
module.exports = async () => {
  process.env.TZ = 'Europe/Warsaw';
};
