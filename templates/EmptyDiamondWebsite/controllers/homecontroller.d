module controllers.homecontroller;

import diamond.controllers;

/// The home controller.
final class HomeController(TView) : Controller!TView
{
  public:
  final:
  /**
  * Creates a new instance of the home controller.
  * Params:
  *   view =  The view assocaited with the controller.
  */
  this(TView view)
  {
    super(view);
  }

  /// Route: / | /home
  @HttpDefault Status home()
  {
    return Status.success;
  }
}
