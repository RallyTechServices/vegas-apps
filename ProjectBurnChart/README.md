ProjectBurnChart
=========================

### Overview
This application calculates burn down, burn up and increases in scope over the project iterations, 
as well as the projected completion date for a project that has its scope defined up front.

### Notes

* The green bars (accepted/cumulative accepted) are based on a WSAPI call, not lookback.  This way, items
  that were accepted in a different release/iteration are counted as the release/iteration that they are
  a part of right now.

### Development
This one is written with the Rally App Builder.  To compile after modifying, type rally-app-builder.

### License

AppTemplate is released under the MIT license.  See the file [LICENSE](https://raw.github.com/RallyApps/AppTemplate/master/LICENSE) for the full text.
