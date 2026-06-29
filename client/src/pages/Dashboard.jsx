import { useEffect, useState } from "react";
import API from "../services/api";
import CreateGroup from "../components/CreateGroup";
import { Link } from "react-router-dom";

function Dashboard() {
    const [user, setUser] = useState(null);
    const [groups, setGroups] = useState([]);

    useEffect(() => {
        fetchUser();
        fetchGroups();
    }, []);

    const token = localStorage.getItem("token");

    const fetchUser = async () => {
        try {
            const res = await API.get("/auth/me", {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            setUser(res.data);
        } catch (err) {
            console.log(err.response?.data);
        }
    };

    const fetchGroups = async () => {
        try {
            const res = await API.get("/groups", {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            setGroups(res.data);
        } catch (err) {
            console.log(err.response?.data);
        }
    };

    return (
        <div>
            <h1>Dashboard</h1>

            {user && (
                <>
                    <h2>Welcome {user.name}</h2>
                    <p>{user.email}</p>
                </>
            )}

            <hr />
            <CreateGroup onGroupCreated={fetchGroups} />

            <h2>My Groups</h2>

            {groups.length === 0 ? (
                <p>No Groups Found</p>
            ) : (

                
                <ul>
                    {groups.map((group) => (
                        <li key={group._id}>
                            <Link to={`/groups/${group._id}`}>
                                {group.name}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default Dashboard;