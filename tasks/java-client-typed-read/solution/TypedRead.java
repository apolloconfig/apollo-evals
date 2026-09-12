package scenario;
import com.ctrip.framework.apollo.Config;
import com.ctrip.framework.apollo.ConfigService;
public final class TypedRead {
  public static void main(String[] args) {
    Config c = ConfigService.getConfig(args[0], args[1]);
    String s = c.getProperty(args[2], "");
    int i = c.getIntProperty(args[3], -1);
    boolean b = c.getBooleanProperty(args[4], false);
    String m = c.getProperty(args[5], "fallback-value");
    System.out.printf("{\"string\":\"%s\",\"int\":%d,\"boolean\":%s,\"missing\":\"%s\"}%n", s, i, b, m);
  }
}
