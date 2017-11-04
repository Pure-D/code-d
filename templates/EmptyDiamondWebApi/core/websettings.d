module websettings;

import diamond.core.websettings;

class DiamondWebSettings : WebSettings
{
  import vibe.d : HTTPServerRequest, HTTPServerResponse, HTTPServerErrorInfo;
  import diamond.http;

  private:
  this()
  {
    super();
  }

  public:
  override void onApplicationStart()
  {
  }

  override bool onBeforeRequest(HttpClient client)
  {
    return true;
  }

  override void onAfterRequest(HttpClient client)
  {

  }

  override void onHttpError(Throwable thrownError, HTTPServerRequest request,
    HTTPServerResponse response, HTTPServerErrorInfo error)
  {
    response.bodyWriter.write(thrownError.toString());
  }

  override void onNotFound(HTTPServerRequest request, HTTPServerResponse response)
  {
    import std.string : format;

    response.bodyWriter.write(format("The path '%s' wasn't found.'", request.path));
  }

  override void onStaticFile(HttpClient client)
  {

  }
}

void initializeWebSettings()
{
  webSettings = new DiamondWebSettings;
}
