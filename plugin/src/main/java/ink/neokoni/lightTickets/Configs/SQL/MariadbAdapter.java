package ink.neokoni.lightTickets.Configs.SQL;

public class MariadbAdapter extends SQLAdapter {
    public MariadbAdapter() {
        super();
    }

    @Override
    public String getDriverClass() {
        return "org.mariadb.jdbc.Driver";
    }
}