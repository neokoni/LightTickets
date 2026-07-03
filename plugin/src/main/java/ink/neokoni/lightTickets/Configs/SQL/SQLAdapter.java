package ink.neokoni.lightTickets.Configs.SQL;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import ink.neokoni.lightTickets.Configs.Config;
import ink.neokoni.lightTickets.Configs.Datas.PlayerBind;
import ink.neokoni.lightTickets.Configs.Datas.StorageInfo;
import org.bukkit.entity.Player;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.UUID;

public class SQLAdapter {
    private HikariDataSource dataSource;

    public SQLAdapter() {
        dataSource = initSql();
        initTable();
    }

    public HikariDataSource initSql() {
        HikariConfig hikariConfig = new HikariConfig();
        StorageInfo databaseInfo = Config.getConfig().getStorage();
        StringBuilder baseUrlBuilder = new StringBuilder();
        baseUrlBuilder.append("jdbc:")
                .append(databaseInfo.type().toLowerCase())
                .append("://")
                .append(databaseInfo.host())
                .append(":")
                .append(databaseInfo.port())
                .append("/")
                .append(databaseInfo.database());
        if (databaseInfo.args() != null && !databaseInfo.args().isEmpty()
                && !databaseInfo.args().equalsIgnoreCase("null")) {
            baseUrlBuilder.append("?").append(databaseInfo.args());
        }
        hikariConfig.setJdbcUrl(baseUrlBuilder.toString());
        hikariConfig.setDriverClassName(getDriverClass());
        hikariConfig.setUsername(databaseInfo.username());
        hikariConfig.setPassword(databaseInfo.password());
        return new HikariDataSource(hikariConfig);
    }

    public String getDriverClass() {
        return "com.mysql.cj.jdbc.Driver";
    }

    public HikariDataSource getDataSource() {
        return dataSource;
    }

    public void initTable() {
        runSql(enableForeignKeySql());
        runSql(getCreatePlayerBindTableSql());
        runSql(getAddPlayerRoleColumnSql());
    }

    public PlayerBind getPlayerBind(Player player) {
        try (Connection connection = getDataSource().getConnection()) {
            PreparedStatement statement = connection.prepareStatement(getPlayerBindSql());
            statement.setString(1, player.getUniqueId().toString());
            ResultSet resultSet = statement.executeQuery();
            if (resultSet.next()) {
                return new PlayerBind(
                        player,
                        UUID.fromString(resultSet.getString("uuid")),
                        resultSet.getString("mc_name"),
                        resultSet.getString("bind_code"),
                        resultSet.getString("code_expires_at"),
                        resultSet.getBoolean("bound"),
                        readString(resultSet, "role", "player")
                );
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
        return null;
    }

    public void setPlayerBind(Player player, PlayerBind bind) {
        try (Connection connection = getDataSource().getConnection()) {
            PreparedStatement statement = connection.prepareStatement(setPlayerBindSql());
            statement.setString(1, player.getUniqueId().toString());
            statement.setString(2, bind.getMcName());
            statement.setString(3, bind.getBindCode());
            statement.setString(4, bind.getCodeExpiresAt());
            statement.setBoolean(5, bind.isBound());
            statement.setString(6, bind.getRole() == null ? "player" : bind.getRole());

            statement.setString(7, bind.getMcName());
            statement.setString(8, bind.getBindCode());
            statement.setString(9, bind.getCodeExpiresAt());
            statement.setBoolean(10, bind.isBound());
            statement.setString(11, bind.getRole() == null ? "player" : bind.getRole());
            statement.execute();
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public String getCreatePlayerBindTableSql() {
        return """
                CREATE TABLE IF NOT EXISTS player_bind (
                    uuid VARCHAR(36) PRIMARY KEY,
                    mc_name VARCHAR(64),
                    bind_code VARCHAR(16),
                    code_expires_at VARCHAR(40),
                    bound TINYINT(1) DEFAULT 0,
                    role VARCHAR(16) DEFAULT 'player'
                );
                """;
    }

    public String getAddPlayerRoleColumnSql() {
        return "ALTER TABLE player_bind ADD COLUMN role VARCHAR(16) DEFAULT 'player';";
    }

    public String getPlayerBindSql() {
        return """
                SELECT * FROM player_bind WHERE uuid=?;
                """;
    }

    public String setPlayerBindSql() {
        return """
                INSERT INTO player_bind(uuid, mc_name, bind_code, code_expires_at, bound, role)
                VALUES(?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE mc_name=?, bind_code=?, code_expires_at=?, bound=?, role=?;
                """;
    }

    public String enableForeignKeySql() {
        String type = Config.getConfig().getStorage().type().toLowerCase();
        return type.equals("sqlite") ? "PRAGMA foreign_keys=ON;" : "";
    }

    public void close() {
        getDataSource().close();
    }

    private void runSql(String sql) {
        if (sql == null || sql.isEmpty()) return;
        try (Connection connection = getDataSource().getConnection()) {
            connection.prepareStatement(sql).execute();
        } catch (SQLException e) {
            if (!isDuplicateColumnError(e)) {
                throw new RuntimeException(e);
            }
        }
    }

    private String readString(ResultSet resultSet, String column, String fallback) throws SQLException {
        try {
            String value = resultSet.getString(column);
            return value == null || value.isEmpty() ? fallback : value;
        } catch (SQLException e) {
            return fallback;
        }
    }

    private boolean isDuplicateColumnError(SQLException e) {
        String state = e.getSQLState();
        String message = e.getMessage() == null ? "" : e.getMessage().toLowerCase();
        return "42S21".equals(state)
                || message.contains("duplicate column")
                || message.contains("already exists");
    }
}
