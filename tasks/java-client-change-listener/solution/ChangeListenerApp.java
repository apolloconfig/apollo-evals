package scenario;
import com.ctrip.framework.apollo.Config;
import com.ctrip.framework.apollo.ConfigChangeListener;
import com.ctrip.framework.apollo.ConfigService;
import com.ctrip.framework.apollo.model.ConfigChange;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
public final class ChangeListenerApp {
 public static void main(String[] a) throws Exception {
  Config c=ConfigService.getConfig(a[0],a[1]); String initial=c.getProperty(a[2],""); CountDownLatch done=new CountDownLatch(1);
  ConfigChangeListener listener=e->{if(e.isChanged(a[2])){ConfigChange x=e.getChange(a[2]); System.out.printf("{\"event\":\"change\",\"key\":\"%s\",\"oldValue\":\"%s\",\"newValue\":\"%s\",\"changeType\":\"%s\"}%n",a[2],x.getOldValue(),x.getNewValue(),x.getChangeType());System.out.flush();done.countDown();}};
  c.addChangeListener(listener); System.out.printf("{\"event\":\"ready\",\"value\":\"%s\"}%n",initial); System.out.flush(); if(!done.await(60,TimeUnit.SECONDS)) System.exit(2);
 }
}
