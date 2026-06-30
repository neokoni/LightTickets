package ink.neokoni.lightTickets.Configs.SQL;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import ink.neokoni.lightTickets.Utils.ConfigUtils;

public class SQLiteAdapter extends SQLAdapter {
    public SQLiteAdapter() {
        super();
    }

    @Override
    public HikariDataSource initSql() {
        HikariConfig hikariConfig = new HikariConfig();
        StringBuilder baseUrlBuilder = new StringBuilder();
        baseUrlBuilder.append("jdbc:sqlite:")
                .append(ConfigUtils.getFile("PlayerData.db").getAbsoluteFile());
        hikariConfig.setJdbcUrl(baseUrlBuilder.toString());
        hikariConfig.setDriverClassName(getDriverClass());
        return new HikariDataSource(hikariConfig);
    }

    @Override
    public String getDriverClass() {
        return "org.sqlite.JDBC";
    }

    @Override
    public String getCreatePlayerBindTableSql() {
        return """
                CREATE TABLE IF NOT EXISTS player_bind (
                    uuid TEXT PRIMARY KEY,
                    mc_name TEXT,
                    bind_code TEXT,
                    code_expires_at TEXT,
                    bound INTEGER DEFAULT 0
                );
                """;
    }

    @Override
    public String setPlayerBindSql() {
        return """
                INSERT INTO player_bind(uuid, mc_name, bind_code, code_expires_at, bound)
                VALUES(?, ?, ?, ?, ?)
                ON CONFLICT(uuid) DO UPDATE SET mc_name=?, bind_code=?, code_expires_at=?, bound=?;
                """;
    }
}