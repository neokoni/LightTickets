package ink.neokoni.lighttickets.storage;

import ink.neokoni.lighttickets.model.Notification;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

public class NotificationStore {
    private final String dbPath;

    public NotificationStore(String dbPath) {
        this.dbPath = dbPath;
        initTable();
    }

    private Connection connect() throws SQLException {
        return DriverManager.getConnection("jdbc:sqlite:" + dbPath);
    }

    private void initTable() {
        try (Connection conn = connect(); Statement stmt = conn.createStatement()) {
            stmt.execute("""
                CREATE TABLE IF NOT EXISTS lt_notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    player_uuid TEXT NOT NULL,
                    message TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                )
                """);
        } catch (SQLException e) {
            throw new RuntimeException("Failed to initialize notification database", e);
        }
    }

    public void insert(String playerUuid, String message) {
        String sql = "INSERT INTO lt_notifications (player_uuid, message, created_at) VALUES (?, ?, ?)";
        try (Connection conn = connect(); PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, playerUuid);
            ps.setString(2, message);
            ps.setLong(3, System.currentTimeMillis());
            ps.executeUpdate();
        } catch (SQLException e) {
            // silently drop
        }
    }

    public List<Notification> popAll(String playerUuid) {
        List<Notification> notifications = new ArrayList<>();
        String selectSql = "SELECT id, player_uuid, message, created_at FROM lt_notifications WHERE player_uuid = ? ORDER BY created_at ASC";
        String deleteSql = "DELETE FROM lt_notifications WHERE player_uuid = ?";

        try (Connection conn = connect()) {
            conn.setAutoCommit(false);
            try (PreparedStatement sel = conn.prepareStatement(selectSql)) {
                sel.setString(1, playerUuid);
                ResultSet rs = sel.executeQuery();
                while (rs.next()) {
                    notifications.add(new Notification(
                        rs.getInt("id"),
                        rs.getString("player_uuid"),
                        rs.getString("message"),
                        rs.getLong("created_at")
                    ));
                }
            }
            try (PreparedStatement del = conn.prepareStatement(deleteSql)) {
                del.setString(1, playerUuid);
                del.executeUpdate();
            }
            conn.commit();
        } catch (SQLException e) {
            // silently drop
        }
        return notifications;
    }

    public void close() {
        // No persistent connection — each method opens/closes its own
    }
}
