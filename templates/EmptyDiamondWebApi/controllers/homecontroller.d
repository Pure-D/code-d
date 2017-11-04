module controllers.homecontroller;

import diamond.controllers;

/// The home controller.
final class HomeController : Controller
{
  public:
  final:
  /// Creates a new instance of the home controller.
  this() { super(); }

  /// Route: / | /home
  @HttpDefault Status home()
  {
    return Status.success;
  }
}
