package scenario;
import com.ctrip.framework.apollo.Config;
import com.ctrip.framework.apollo.ConfigFile;
import com.ctrip.framework.apollo.ConfigService;
import com.ctrip.framework.apollo.core.enums.ConfigFileFormat;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
public final class MixedNamespaceFormats {
  private MixedNamespaceFormats() {}
  public static void main(String[] args) {
    System.setProperty("app.id", args[0]);
    Config yaml = ConfigService.getConfig(args[0], args[1]);
    boolean enabled = yaml.getBooleanProperty(args[3], false);
    int limit = yaml.getIntProperty(args[4], -1);
    String jsonNamespace = args[2].endsWith(".json") ? args[2].substring(0, args[2].length() - 5) : args[2];
    ConfigFile json = ConfigService.getConfigFile(jsonNamespace, ConfigFileFormat.JSON);
    String encoded = Base64.getEncoder().encodeToString(json.getContent().getBytes(StandardCharsets.UTF_8));
    System.out.printf("{\"yamlEnabled\":%s,\"yamlLimit\":%d,\"jsonBase64\":\"%s\"}%n", enabled, limit, encoded);
  }
}
