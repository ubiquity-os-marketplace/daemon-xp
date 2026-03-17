# Changelog

## [1.1.0](https://github.com/ubiquity-os-marketplace/daemon-xp/compare/v1.0.0...v1.1.0) (2026-02-19)


### Features

* show repo/org/global xp totals ([39cc94b](https://github.com/ubiquity-os-marketplace/daemon-xp/commit/39cc94b54563187fd8dbf082c3054f863e8be1f3))


### Bug Fixes

* exclude issue_comment.created from manifest listeners ([94d5957](https://github.com/ubiquity-os-marketplace/daemon-xp/commit/94d595731d8791990f68b7e9cbcdd6ff6d24662a))
* handle /xp commands from review events ([26676b2](https://github.com/ubiquity-os-marketplace/daemon-xp/commit/26676b2f45ed3fb78ee6cadfd536c1364eab4fde))
* handle multi-location permits in scoped totals ([045b1b3](https://github.com/ubiquity-os-marketplace/daemon-xp/commit/045b1b386bf97a9b40732895afc90f275f31c855))
* pin manifest workflow to issue-27 deploy action ([8bc7826](https://github.com/ubiquity-os-marketplace/daemon-xp/commit/8bc78267e2e8e2c2aef129b42d9813aa6749eac7))
* sync manifest workflow metadata for issue 27 ([2c31375](https://github.com/ubiquity-os-marketplace/daemon-xp/commit/2c313751809ed7641effea2e7ffe43682dcef6c0))
* sync workflow skipBotEvents and parameter metadata ([570f0a3](https://github.com/ubiquity-os-marketplace/daemon-xp/commit/570f0a3983c1ffed3a28579ef43c2bcdf9dfb242))

## 1.0.0 (2025-12-15)

### Features

- add command handling support with `handleCommand` integration in plugin flow ([f649f7c](https://github.com/ubiquity-os-marketplace/daemon-xp/commit/f649f7ca061086f11ca73f28e5e3ca55040e1ca6))
- add disqualification-based banning logic and schema updates ([5c72906](https://github.com/ubiquity-os-marketplace/daemon-xp/commit/5c72906cbe6a41aafc3a9141c33e186e881d2396))
- add XP user lookup endpoint and GitHub user fetch integration ([870628d](https://github.com/ubiquity-os-marketplace/daemon-xp/commit/870628d10d6d7f0f9123b6cfd1ce0b2d509ec6c3))
- implement issue unassignment handling and XP deduction logic ([190a176](https://github.com/ubiquity-os-marketplace/daemon-xp/commit/190a1762b3297a6a643af62752bbbf3ca054fb52))

### Bug Fixes

- add GraphQL schema support and enhance involved user collection for linked pull requests ([ea7d894](https://github.com/ubiquity-os-marketplace/daemon-xp/commit/ea7d894859f4a85e52e5159bf4ab3fc823b1e479))
- correct total XP calculation after malus adjustment in `handleIssueUnassigned` ([56be734](https://github.com/ubiquity-os-marketplace/daemon-xp/commit/56be734bb9b329a8a4ef179cf4131fcee5181bcb))
- ensure fallback to sender login when XP command username is missing ([361c85f](https://github.com/ubiquity-os-marketplace/daemon-xp/commit/361c85fb6ac4cbc0f2eeaa6641c3e89cdc661e0a))
- handle unsupported HTTP methods for /xp route in worker ([7860bd3](https://github.com/ubiquity-os-marketplace/daemon-xp/commit/7860bd39d52ebc4146403252178c044f9b01c3e9))
- migrate testing setup from Jest to Bun and simplify workflows ([fd3783e](https://github.com/ubiquity-os-marketplace/daemon-xp/commit/fd3783ef5961275c46345f16d9ca3f233ce31fbb))
- stop command does not count as a negative reward ([478b40b](https://github.com/ubiquity-os-marketplace/daemon-xp/commit/478b40bdd17faf7450e66a55f9f871e7b94ba200))
- support @ usernames in xp command ([1cc9b28](https://github.com/ubiquity-os-marketplace/daemon-xp/commit/1cc9b287a683f7ae4162d9952ffd73fe3cae2d0a))
