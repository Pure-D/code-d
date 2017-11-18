module controllers.homecontroller;

import diamond.controllers;

/// The home controller.
final class HomeController : Controller
{
  public:
  final:
  /**
  * Creates a new instance of the home controller.
  * Params:
  *   client =  The client assocaited with the controller.
  */
  this(HttpClient client)
  {
    super(client);
  }

  /// Route: / | /home
  @HttpDefault Status home()
  {
    return Status.success;
  }
}
