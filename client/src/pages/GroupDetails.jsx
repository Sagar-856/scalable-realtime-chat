import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import API from "../services/api";
import { useNavigate } from "react-router-dom";


function GroupDetails() {

    const navigate = useNavigate();
    const { groupId } = useParams();

    const [group, setGroup] = useState(null);

    const [currentUser, setCurrentUser] = useState(null);

    useEffect(() => {
        fetchGroup();
    }, []);

   const fetchGroup = async () => {
    try {

        const token = localStorage.getItem("token");

        const res = await API.get(`/groups/${groupId}`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        setGroup(res.data);

        const userRes = await API.get("/auth/me", {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        setCurrentUser(userRes.data);

    } catch (err) {
        console.log(err.response?.data);
    }
};

    const handleLeave = async () => {
    try {
        const token = localStorage.getItem("token");

        await API.post(
            `/groups/${groupId}/leave`,
            {},
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }
        );

        alert("You left the group.");

        navigate("/dashboard");

    } catch (err) {
        console.log(err.response?.data);
    }
    };

    const handleDelete = async () => {
    try {

        const token = localStorage.getItem("token");

        await API.delete(`/groups/${groupId}`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        alert("Group deleted");

        navigate("/dashboard");

    } catch (err) {
        console.log(err.response?.data);
    }
};

    if (!group) {
        return <h2>Loading...</h2>;
    }

    return (
        <div>

            <h1>{group.name}</h1>

            <p>{group.description}</p>
            <h3>Created By</h3>
            <p>{group.createdBy.name}</p>

            <h3>Members</h3>

            <ul>
                {group.members.map((member) => (
                    <li key={member._id}>
                        {member.name}
                    </li>
                ))}
            </ul>

            <button onClick={handleLeave}>
                Leave Group
            </button>
            {
            currentUser &&
            group.createdBy._id === currentUser._id && (
            <button onClick={handleDelete}>
                Delete Group
            </button>
    )
}

        </div>
    );
}

export default GroupDetails;