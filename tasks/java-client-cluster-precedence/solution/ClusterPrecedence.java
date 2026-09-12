package scenario;
import com.ctrip.framework.apollo.Config;
import com.ctrip.framework.apollo.ConfigService;
public final class ClusterPrecedence {
  private ClusterPrecedence() {}
  public static void main(String[] args) {
    System.setProperty("apollo.cluster", args[3]);
    Config config = ConfigService.getConfig(args[0], args[1]);
    String value = config.getProperty(args[2], "");
    System.out.printf("{\"cluster\":\"%s\",\"value\":\"%s\"}%n", args[3], value);
  }
}
