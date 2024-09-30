import { PromiseReturn, UserData, UserLoginData } from '../../interfaces/interface';
import { createToken } from '../../utils/jwt';
import userRepo from '../repository/UserRepo';

export default new class UseCase {
    
    createUser = async (userData: UserData): Promise<PromiseReturn> => {
        try {
            // Check if the user already exists based on email
            const existingUser = await userRepo.findUserByEmail(userData.email);
            if (existingUser) {
                return { status: 400, message: "User with this email already exists." };
            }
    
            // Validate that at least one role is assigned
            if (!userData.roles || userData.roles.length === 0) {
                return { status: 400, message: "At least one role must be assigned." };
            }
    
            // Ensure the TO role is assigned if the PO role is included
            if (userData.roles.includes("PO") && !userData.teamOwner) {
                return { status: 400, message: "A TO must be selected if a PO role is assigned." };
            }
    
            // Create the user
            // const newUser = userRepo.create(userData);
    
            // Automatically create a team if the user has the TO role
            if (userData.roles.includes("TO")) {
                // const team = teamRepo.create({ toUserId: newUser.id });
                // await teamRepo.save(team);
            }
    
            // Save the new user to the database
            // const savedUser = await userRepo.save(newUser);
    
            return { status: 201, message: "User created successfully.",  };
    
        } catch (error) {
            console.error("Error during user creation:", error);
            return { status: 500, message: "Internal server error." };
        }
    };
    

    login = async (loginData: UserLoginData): Promise<PromiseReturn> => {
        try {
            const user = await userRepo.findUserByEmail(loginData.email);            
            if (!user) {
                return { status: 400, message: "Invalid email." }; 
            }else{
                if(user.password === loginData.password){
                    console.log("login successfully");
                    const roles=user?.roles.map((item)=>item.roleName)
                    const token=await createToken(user.id,roles,"1d")
                    return { status: 200, User:user,token,message: "user logged succesfully." }; 
                }else{
                    return { status: 400, message: "Invalid password." }; 
                }
            }
        } catch (error) {
            console.error("Error during login:", error);
            return { status: 500, message: "Internal server error." }; 
        }

    };
};
