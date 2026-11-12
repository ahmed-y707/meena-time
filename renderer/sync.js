// Offline edition: the program has no link to any website — everything lives in this PC's database.
// The screens still ask WebSync whether the site owns a table; offline the answer is always «no».
const WebSync = {
  linked: false,
  init() {},
  blocks() { return false },
  sync() {},
}
