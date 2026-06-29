import { useState } from "react";
import API from "../services/api";

function CreateGroup({ onGroupCreated }) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            const token = localStorage.getItem("token");

            await API.post(
                "/groups",
                {
                    name,
                    description,
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            setName("");
            setDescription("");

            onGroupCreated();

        } catch (err) {
            console.log(err.response?.data);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <h2>Create Group</h2>

            <input
                type="text"
                placeholder="Group Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
            />

            <br /><br />

            <input
                type="text"
                placeholder="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
            />

            <br /><br />

            <button type="submit">Create Group</button>
        </form>
    );
}

export default CreateGroup;